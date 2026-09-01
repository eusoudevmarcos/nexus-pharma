import type { NextRequest } from "next/server";
import { proxyPrime } from "@/lib/prime-proxy";

type Context = { params: Promise<{ path: string[] }> };
const target = async (context: Context) => `/api/v1/prime/${(await context.params).path.join("/")}`;
export async function GET(_request: NextRequest, context: Context) { return proxyPrime(await target(context), { method: "GET" }); }
export async function POST(request: NextRequest, context: Context) { return proxyPrime(await target(context), { method: "POST", body: await request.text() }); }
export async function PUT(request: NextRequest, context: Context) { return proxyPrime(await target(context), { method: "PUT", body: await request.text() }); }
export async function PATCH(request: NextRequest, context: Context) { return proxyPrime(await target(context), { method: "PATCH", body: await request.text() }); }
