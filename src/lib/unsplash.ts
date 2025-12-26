import { createApi } from "unsplash-js";

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