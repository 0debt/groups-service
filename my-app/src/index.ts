import { Hono } from 'hono'
import mongoose, { connect } from 'mongoose'
import { Group } from './models/Group'
import { serve } from "bun"
import { connectDB } from './db/db'

const app = new Hono()


connectDB()


async function createGroup(name: string, description: string, members: string[]) {

  const group = new Group({
    name,
    description,
    members,
  });
  await group.save();
  console.log('Group created:', group);
  return group;
}





export default app


















