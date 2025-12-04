import mongoose from 'mongoose';


const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables');
}

export async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI as string);
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        throw error;
    }
}
