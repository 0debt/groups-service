import mongoose from 'mongoose';
import { IGroup } from './services';
import { Group } from './services';
import { circuitBreakerInstance } from './services';


type ExpensesSummaryDTO = {
    totalAmount: number;
    expensesCount: number;
    lastExpenseAt?: string;
    currency?: string;
};

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

export const GroupSummary = mongoose.model<IGroupSummary>('GroupSummary', groupSummarySchema);

export async function upsertGroupSummary(group: mongoose.HydratedDocument<IGroup>) {
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

export async function getGroupSummary(groupId: string): Promise<IGroupSummary> {

    const summary = await GroupSummary
        .findOne({ groupId })
        .lean<IGroupSummary>();

    if (!summary) {
        throw new Error("Group summary not found");

    }

    return summary;
}


// export async function getGroupSummary(groupId: string): Promise<IGroupSummary> {
//     // 1) prendo la MV se esiste
//     let summary = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();

//     // 2) se non esiste, la creo dai dati del gruppo (interni)
//     if (!summary) {
//         const group = await Group.findById(groupId);
//         if (!group) {
//             throw new Error("Group not found");
//         }

//         await upsertGroupSummary(group);
//         summary = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();

//         if (!summary) {
//             throw new Error("Group summary not found");
//         }
//     }

//     if (!circuitBreakerInstance.canRequest()) {
//         console.log("Circuit breaker is OPEN. Returning cached summary.");
//         return summary;
//     }
//     // 3) ON READ: provo a prendere i dati spese da expenses-service e salvarli nella MV
//     try {
//         const exp = await fetchExpensesSummary(groupId);
//         await upsertExpensesIntoGroupSummary(groupId, exp);
//     } catch (err) {
//         // fallback: se expenses è giù, tengo i dati cached e segno stale
//         await GroupSummary.updateOne(
//             { groupId },
//             { $set: { expensesStale: true, updatedAt: new Date() } }
//         );
//     }

//     // 4) rileggo la MV aggiornata e la ritorno
//     const refreshed = await GroupSummary.findOne({ groupId }).lean<IGroupSummary>();
//     if (!refreshed) throw new Error("Group summary not found");

//     return refreshed;
// }



export async function upsertExpensesIntoGroupSummary(groupId: string, exp: ExpensesSummaryDTO) {
    await GroupSummary.updateOne(
        { groupId },
        {
            $inc: {
                totalAmount: exp.totalAmount ?? 0,
                expensesCount: exp.expensesCount ?? 0
            },
            $set: {
                lastExpenseAt: exp.lastExpenseAt ? new Date(exp.lastExpenseAt) : undefined,
                currency: exp.currency ?? "EUR",
                expensesStale: false,
                updatedAt: new Date(),
            },
        },
        { upsert: true }
    );
}



// export async function upsertExpensesIntoGroupSummary(groupId: string, exp: ExpensesSummaryDTO) {
//     await GroupSummary.updateOne(
//         { groupId },
//         {
//             $set: {
//                 totalAmount: exp.totalAmount ?? 0,
//                 expensesCount: exp.expensesCount ?? 0,
//                 lastExpenseAt: exp.lastExpenseAt ? new Date(exp.lastExpenseAt) : undefined,
//                 currency: exp.currency ?? "EUR",
//                 expensesStale: false,
//                 updatedAt: new Date(),
//             },
//         },
//         { upsert: true }
//     );
// }

// async function fetchExpensesSummary(groupId: string): Promise<ExpensesSummaryDTO> {
//     const baseUrl = process.env.EXPENSES_SERVICE_URL;
//     if (!baseUrl) {
//         throw new Error("EXPENSES_SERVICE_URL not set");
//     }


//     const response = await fetch(
//         `${baseUrl}/expenses/groups/${groupId}/summary`,
//         {
//             method: "GET",
//             headers: { "Content-Type": "application/json" },
//         }
//     );

//     if (!response.ok) {
//         throw new Error(
//             `expenses-service error: ${response.status}`
//         );
//     }

//     return response.json();
// }



