import mongoose from 'mongoose';


export interface IGroup {
    name: string;
    description?: string;
    members: string[];
    createdAt: Date;
    imageUrl?: string;
}

const groupSchema = new mongoose.Schema<IGroup>({
    name: { type: String, required: true },
    description: { type: String },
    members: { type: [String], required: true },
    createdAt: { type: Date, default: Date.now },
    imageUrl: { type: String }
});

export async function createGroup(name: string, description: string, members: string[], imageUrl: string) {

    const group = new Group({
        name,
        description,
        members,
        imageUrl: 'https://example.com/image.png'
    });

    await group.save();
    console.log('Group created:', group);
    return group;
}

export const Group = mongoose.model<IGroup>('Group', groupSchema);

//delete = eliminare il gruppo
export async function deleteGroup(groupId: string) {
    const group = await Group.findById(groupId);
    if (!group) {
        throw new Error('Group not found');
    }

    await Group.deleteOne({ _id: groupId });
    console.log('Group deleted:', group);
    return group;
}


//update = aggiungere o eliminare un membro
export async function updateGroupMembers( groupId: string, memberToAdd?: string, memberToRemove?: string){
    const group = await Group.findById(groupId);
    if (!group) {
        throw new Error("Group not found");
    }

    let modified: boolean = false;

    // Aggiungi un membro
    if (memberToAdd && !group.members.includes(memberToAdd)) {
        group.members.push(memberToAdd);
        modified = true;
    }

    // Rimuovi un membro
    if (memberToRemove && group.members.includes(memberToRemove)) {
        group.members = group.members.filter(
            (member: string) => member !== memberToRemove
        );
        modified = true;
    }

    // Se non è stato fatto nulla, non salvare
    if (!modified) {
        console.log("No modification has been done.");
        return group;
    }

    // Salva solo se cambiato
    await group.save();
    console.log("Group updated:", group);
    return group;
}