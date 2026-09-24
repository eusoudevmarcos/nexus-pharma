import { proxyInternal } from "@/lib/internal-proxy";

type Context = { params: Promise<{ path: string[] }> };
const target = async (context: Context) => `/api/v1/interno/industria/${(await context.params).path.map(encodeURIComponent).join("/")}`;

export async function POST(request: Request, context: Context) { return proxyInternal(await target(context), { method: "POST", body: await request.text() }); }
export async function PATCH(request: Request, context: Context) { return proxyInternal(await target(context), { method: "PATCH", body: await request.text() }); }
export async function PUT(request: Request, context: Context) { return proxyInternal(await target(context), { method: "PUT", body: await request.text() }); }
