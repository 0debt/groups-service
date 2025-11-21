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

