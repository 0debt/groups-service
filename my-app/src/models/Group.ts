import mongoose from 'mongoose';

const MongoDB_URI = process.env.MONGODB_URI;
if (!MongoDB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables');
}

export interface IGroup {
    name: string;
    description?: string;
    members: string[];
    createdAt: Date;
}

const groupSchema = new mongoose.Schema<IGroup>({
    name: { type: String, required: true },
    description: { type: String },
    members: { type: [String], required: true },
    createdAt: { type: Date, default: Date.now },
});

export const Group = mongoose.model<IGroup>('Group', groupSchema);

