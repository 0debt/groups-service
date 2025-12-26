import mongoose from 'mongoose';
import { createApi } from "unsplash-js";
import { publishGroupEvent } from '../lib/redisPublisher';
import { circuitBreaker } from '../lib/circuitBreaker';
import { upsertGroupSummary } from '../services/summaryGroup';
import { GroupSummary } from './summaryGroup';
import { requestPhoto } from '../lib/unsplash';
export interface IGroup {
  name: string;
  description?: string;
  members: string[];
  owner: string;
  createdAt: Date;
  imageUrl: string;
}



export const groupSchema = new mongoose.Schema<IGroup>({
  name: { type: String, required: true },
  description: { type: String },
  members: { type: [String], required: true },
  owner: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  imageUrl: { type: String }
});





export const circuitBreakerInstance = new circuitBreaker(5, 60000); // threshold di 5 fallimenti, timeout di 60 secondi

export const Group = mongoose.model<IGroup>('Group', groupSchema);




export async function createGroup(name: string, owner: string, description: string, members: string[]) {

  // Default fallback image
  let imageUrl = process.env.DEFAULT_GROUP_IMAGE_URL;

  // Usa il circuit breaker per la chiamata a Unsplash
  if (circuitBreakerInstance.canRequest()) {
    try {
      imageUrl = await requestPhoto();
      circuitBreakerInstance.recordSuccess();
    } catch (err) {
      console.warn("requestPhoto failed, using fallback image", err);
      circuitBreakerInstance.recordFailure();
    }
  } else {
    console.log("Circuit breaker aperto: uso immagine fallback");
  }


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

