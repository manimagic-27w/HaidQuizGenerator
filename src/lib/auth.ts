import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type Viewer = { id: string; name: string; isParent: boolean };

function parentEmails(): string[] {
  return (process.env.PARENT_EMAILS || "")
    .split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
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

export type Student = { id: string; name: string; email: string };

/** Everyone who has signed up, minus the parents. A student appears here after accepting their invite. */
export async function listStudents(): Promise<Student[]> {
  const parents = parentEmails();
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ limit: 200, orderBy: "created_at" });
  return data
    .filter((u) => !u.emailAddresses.some((e) => parents.includes(e.emailAddress.toLowerCase())))
    .map((u) => {
      const email = u.primaryEmailAddress?.emailAddress || u.emailAddresses[0]?.emailAddress || "";
      return { id: u.id, email, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || email };
    });
}

/** True when a student may see the quiz: it's assigned to everyone, or to them. */
export const canSee = (assignedTo: string[], studentId: string) => !assignedTo.length || assignedTo.includes(studentId);

export async function requireParent(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isParent) redirect("/");
  return v;
}
