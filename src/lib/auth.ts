import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type Viewer = { id: string; name: string; isParent: boolean };

function parentEmails(): string[] {
  return (process.env.PARENT_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** The signed-in person, or null. Parents are the emails listed in PARENT_EMAILS. */
export async function getViewer(): Promise<Viewer | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const emails = (user?.emailAddresses || []).map((e) => e.emailAddress.toLowerCase());
  const parents = parentEmails();
  return {
    id: userId,
    name: user?.firstName || user?.username || "",
    isParent: emails.some((e) => parents.includes(e)),
  };
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/sign-in");
  return v;
}

export async function requireParent(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isParent) redirect("/");
  return v;
}
