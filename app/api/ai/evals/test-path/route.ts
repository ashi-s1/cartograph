import { NextResponse } from "next/server";
import { checkInventedPaths } from "@/lib/ai/eval-paths";

export const dynamic = "force-dynamic";

interface TestPathRequestBody {
  content: string;
  allowedPaths: string[];
}

export async function POST(req: Request) {
  try {
    const body: TestPathRequestBody = await req.json();
    const { content, allowedPaths } = body;

    if (typeof content !== "string" || !Array.isArray(allowedPaths)) {
      return NextResponse.json(
        { error: "content must be a string and allowedPaths must be an array" },
        { status: 400 }
      );
    }

    const result = checkInventedPaths(content, allowedPaths);

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to evaluate paths" },
      { status: 500 }
    );
  }
}
