import { getSettings } from "../../../lib/server-store";
export async function GET() { return Response.json(await getSettings()); }
