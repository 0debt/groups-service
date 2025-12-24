import mongoose from 'mongoose';
import { createApi } from "unsplash-js";
import { publishGroupEvent } from '../redisClient';
import { circuitBreaker } from '../lib/circuitBreaker';

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
  groupId: string;        // ID del gruppo originale
  name: string;
  description?: string;
  members: string[];      // le mail / id che hai già
  membersCount: number;   // campo pre-calcolato
  owner: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
  totalAmount: number;     // somma totale delle spese
  expensesCount: number;  // numero totale delle spese
  lastExpenseAt?: Date;   // data dell'ultima spesa
  currency?: string;    // valuta principale usata nel gruppo
}

export const groupSchema = new mongoose.Schema<IGroup>({
  name: { type: String, required: true },
  description: { type: String },
  members: { type: [String], required: true },
  owner: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  imageUrl: { type: String }
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

export const Group = mongoose.model<IGroup>('Group', groupSchema);

export const GroupSummary = mongoose.model<IGroupSummary>('GroupSummary', groupSummarySchema);

async function upsertGroupSummary(group: mongoose.HydratedDocument<IGroup>) {
  async function upsertGroupSummary(group: mongoose.HydratedDocument<IGroup>) {
    await GroupSummary.findOneAndUpdate(
      { groupId: group._id.toString() },
      {
        $set: { //così aggiorno solo i campi del gruppo senza modificare i campi delle spese
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
}

export async function getGroupSummary(groupId: string): Promise<IGroupSummary> {
  // 1) prendo la MV se esiste
  let summary = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();

  // 2) se non esiste, la creo dai dati del gruppo (interni)
  if (!summary) {
    const group = await Group.findById(groupId);
    if (!group) {
      throw new Error("Group not found");
    }

    await upsertGroupSummary(group);
    summary = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();

    if (!summary) {
      throw new Error("Group summary not found");
    }
  }

  // 3) ON READ: provo a prendere i dati spese da expenses-service e salvarli nella MV
  try {
    const exp = await fetchExpensesSummary(groupId);
    await upsertExpensesIntoGroupSummary(groupId, exp);
  } catch (err) {
    // fallback: se expenses è giù, tengo i dati cached e segno stale
    await GroupSummary.updateOne(
      { groupId },
      { $set: { expensesStale: true, updatedAt: new Date() } }
    );
  }

  // 4) rileggo la MV aggiornata e la ritorno
  const refreshed = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();
  if (!refreshed) throw new Error("Group summary not found");

  return refreshed;
}

async function upsertExpensesIntoGroupSummary(groupId: string, exp: ExpensesSummaryDTO) {
  await GroupSummary.updateOne(
    { groupId },
    {
      $set: {
        totalAmount: exp.totalAmount ?? 0,
        expensesCount: exp.expensesCount ?? 0,
        lastExpenseAt: exp.lastExpenseAt ? new Date(exp.lastExpenseAt) : undefined,
        currency: exp.currency ?? "EUR",
        expensesStale: false,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function fetchExpensesSummary(groupId: string): Promise<ExpensesSummaryDTO> {
  const baseUrl = process.env.EXPENSES_SERVICE_URL;
  if (!baseUrl) {
    throw new Error("EXPENSES_SERVICE_URL not set");
  }


  const response = await fetch(
    `${baseUrl}/expenses/groups/${groupId}/summary`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error(
      `expenses-service error: ${response.status}`
    );
  }

  return response.json();
}


export async function requestPhoto() {

  const unsplash = createApi({
    accessKey: process.env.ACCES_KEY_UNSPLASH as string,
    fetch,
  });
  const result = await unsplash.photos.getRandom({ count: 1 });

  if (result.type === "success") {
    const imageUrl = Array.isArray(result.response) ? result.response[0] : result.response // URL della foto da usare
    const photo = imageUrl.urls.regular
    console.log("URL FOTO:", photo);
    return photo;
  } else {
    console.error("Errore nel recuperare la foto da Unsplash:", result.errors);
    return "";
  }


}

export async function createGroup(name: string, owner: string, description: string, members: string[]) {

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



//delete = eliminare il gruppo
export async function deleteGroup(groupId: string) {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  await Group.deleteOne({ _id: groupId });
  console.log('Group deleted:', group);
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


//update = aggiungere o eliminare un membro
export async function updateGroupMembers(groupId: string, memberToAdd?: string, memberToRemove?: string) {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new Error("Group not found");
  }

  let modified = false;
  let addedMember: string | undefined;
  let removedMember: string | undefined;

  // Aggiungi un membro
  if (memberToAdd && !group.members.includes(memberToAdd)) {
    group.members.push(memberToAdd);
    modified = true;
    addedMember = memberToAdd;
  }

  // Rimuovi un membro
  if (memberToRemove && group.members.includes(memberToRemove)) {
    group.members = group.members.filter(
      (member: string) => member !== memberToRemove
    );
    modified = true;
    removedMember = memberToRemove;
  }

  if (!modified) {
    console.log("No modification has been done.");
    return group;
  }

  await group.save();
  console.log("Group updated:", group);
  await upsertGroupSummary(group);

  // Pubblica eventi su Redis
  if (addedMember) {
    await publishGroupEvent({
      type: "group.member.added",
      groupId,
      payload: {
        member: addedMember,
        members: group.members,
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (removedMember) {
    await publishGroupEvent({
      type: "group.member.removed",
      groupId,
      payload: {
        member: removedMember,
        members: group.members,
      },
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
  if (!group) {
    throw new Error("Group not found");
  }

  let modified = false;
  const previous = {
    name: group.name,
    description: group.description,
  };

  if (name !== undefined) {
    group.name = name;
    modified = true;
  }

  if (description !== undefined) {
    group.description = description;
    modified = true;
  }

  if (!modified) {
    throw new Error("No fields to update. Provide name or description.");
  }

  await group.save();
  console.log("Group info updated:", group);
  await upsertGroupSummary(group);


  await publishGroupEvent({
    type: "group.updated",
    groupId,
    payload: {
      previous,
      current: {
        name: group.name,
        description: group.description,
      },
    },
    timestamp: new Date().toISOString(),
  });

  return group;
}