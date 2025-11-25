import mongoose from 'mongoose';
import { createApi } from "unsplash-js";

export interface IGroup {
    name: string;
    description?: string;
    members: string[];
    owner: string;
    createdAt: Date;
    imageUrl: string;
}

const groupSchema = new mongoose.Schema<IGroup>({
    name: { type: String, required: true },
    description: { type: String },
    members: { type: [String], required: true },
    owner: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    imageUrl: { type: String }
});


export const Group = mongoose.model<IGroup>('Group', groupSchema);


export async function requestPhoto() {

    const unsplash = createApi({
        accessKey: "jmxmcCTz_JxIDWE9wkKCcWyy9TZ9UfCtF1Oza9xnpIc",
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



