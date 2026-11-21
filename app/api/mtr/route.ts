import { live } from "../cache.ts"

export async function GET(request: Request) {
  return (await live(request)) ?? new Response("找不到。", { status: 404 })
}
