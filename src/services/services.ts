import mongoose from "mongoose";
import { createApi } from "unsplash-js";
import { publishGroupEvent } from "../redisClient";

type ExpensesSummaryDTO = {
  totalAmount: number;
  expensesCount: number;
  lastExpenseAt?: string;
  currency?: string;
};

export interface IGroup {
  name: string;
  description?: string;
  members: string[];
  owner: string;
  createdAt: Date;
  imageUrl: string;
}

export interface IGroupSummary {
  groupId: string;
  name: string;
  description?: string;
  members: string[];
  membersCount: number;
  owner: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;

  // campi MV spese (aggiornati da eventi Redis)
  totalAmount: number;
  expensesCount: number;
  lastExpenseAt?: Date;
  currency?: string;
}

export const groupSchema = new mongoose.Schema<IGroup>({
  name: { type: String, required: true },
  description: { type: String },
  members: { type: [String], required: true },
  owner: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  imageUrl: { type: String },
});

const groupSummarySchema = new mongoose.Schema<IGroupSummary>({
  groupId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  members: { type: [String], required: true },
  membersCount: { type: Number, required: true },
  owner: { type: String, required: true },
  imageUrl: { type: String },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, default: Date.now },

  totalAmount: { type: Number, required: true, default: 0 },
  expensesCount: { type: Number, required: true, default: 0 },
  lastExpenseAt: { type: Date },
  currency: { type: String, default: "EUR" },
});

export const Group = mongoose.model<IGroup>("Group", groupSchema);
export const GroupSummary = mongoose.model<IGroupSummary>("GroupSummary", groupSummarySchema);

async function upsertGroupSummary(group: mongoose.HydratedDocument<IGroup>) {
  await GroupSummary.findOneAndUpdate(
    { groupId: group._id.toString() },
    {
      $set: {
        groupId: group._id.toString(),
        name: group.name,
        description: group.description,
        members: group.members,
        membersCount: group.members.length,
        owner: group.owner,
        imageUrl: group.imageUrl,
        createdAt: group.createdAt,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

// La MV spese viene aggiornata dal consumer Redis.
export async function getGroupSummary(groupId: string): Promise<IGroupSummary> {
  let summary = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();

  if (!summary) {
    const group = await Group.findById(groupId);
    if (!group) throw new Error("Group not found");

    await upsertGroupSummary(group);
    summary = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();

    if (!summary) throw new Error("Group summary not found");
  }

  return summary;
}

export async function upsertExpensesIntoGroupSummary(
  groupId: string,
  exp: ExpensesSummaryDTO
) {
  await GroupSummary.updateOne(
    { groupId },
    {
      $set: {
        totalAmount: exp.totalAmount ?? 0,
        expensesCount: exp.expensesCount ?? 0,
        lastExpenseAt: exp.lastExpenseAt ? new Date(exp.lastExpenseAt) : undefined,
        currency: exp.currency ?? "EUR",
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function requestPhoto() {
  const unsplash = createApi({
    accessKey: process.env.ACCES_KEY_UNSPLASH as string,
    fetch,
  });

  const result = await unsplash.photos.getRandom({ count: 1 });

  if (result.type === "success") {
    const imageUrl = Array.isArray(result.response)
      ? result.response[0]
      : result.response;
    const photo = imageUrl.urls.regular;
    console.log("URL FOTO:", photo);
    return photo;
  } else {
    console.error("Errore nel recuperare la foto da Unsplash:", result.errors);
    return "";
  }
}

export async function createGroup(
  name: string,
  owner: string,
  description: string,
  members: string[]
) {
  try {
    const imageUrl = await requestPhoto();

    const group = new Group({
      name,
      owner,
      description,
      members,
      imageUrl,
    });

    await group.save();
    await upsertGroupSummary(group);

    return group;
  } catch (error) {
    console.error(" ERRORE IN CREAZIONE:", error);
    throw error;
  }
}

export async function ReserachchByName(memberName: string) {
  try {
    const groups = await Group.find({ members: memberName });
    return groups;
  } catch (error) {
    console.error("ERRORE NELLA RICERCA:", error);
    throw error;
  }
}

export async function deleteGroup(groupId: string) {
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");

  await Group.deleteOne({ _id: groupId });
  await GroupSummary.deleteOne({ groupId });

  await publishGroupEvent({
    type: "group.deleted",
    groupId,
    payload: {
      name: group.name,
      members: group.members,
      owner: group.owner,
    },
    timestamp: new Date().toISOString(),
  });

  return group;
}

export async function updateGroupMembers(
  groupId: string,
  memberToAdd?: string,
  memberToRemove?: string
) {
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");

  let modified = false;
  let addedMember: string | undefined;
  let removedMember: string | undefined;

  if (memberToAdd && !group.members.includes(memberToAdd)) {
    group.members.push(memberToAdd);
    modified = true;
    addedMember = memberToAdd;
  }

  if (memberToRemove && group.members.includes(memberToRemove)) {
    group.members = group.members.filter((m: string) => m !== memberToRemove);
    modified = true;
    removedMember = memberToRemove;
  }

  if (!modified) return group;

  await group.save();
  await upsertGroupSummary(group);

  if (addedMember) {
    await publishGroupEvent({
      type: "group.member.added",
      groupId,
      payload: { member: addedMember, members: group.members },
      timestamp: new Date().toISOString(),
    });
  }

  if (removedMember) {
    await publishGroupEvent({
      type: "group.member.removed",
      groupId,
      payload: { member: removedMember, members: group.members },
      timestamp: new Date().toISOString(),
    });
  }

  return group;
}

export async function updateGroupInfo(
  groupId: string,
  name?: string,
  description?: string
) {
  const group = await Group.findById(groupId);
  if (!group) throw new Error("Group not found");

  let modified = false;
  const previous = { name: group.name, description: group.description };

  if (name !== undefined) {
    group.name = name;
    modified = true;
  }
  if (description !== undefined) {
    group.description = description;
    modified = true;
  }
  if (!modified) throw new Error("No fields to update. Provide name or description.");

  await group.save();
  await upsertGroupSummary(group);

  await publishGroupEvent({
    type: "group.updated",
    groupId,
    payload: {
      previous,
      current: { name: group.name, description: group.description },
    },
    timestamp: new Date().toISOString(),
  });

  return group;
}