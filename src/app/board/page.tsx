import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBoardData } from "@/db/repo";
import BoardApp from "@/components/board/BoardApp";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const board = getBoardData();
  return <BoardApp initialBoard={board} username={user.username} />;
}