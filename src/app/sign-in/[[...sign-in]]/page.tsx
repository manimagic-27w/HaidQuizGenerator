import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="stack" style={{ alignItems: "center", paddingTop: 24 }}>
      <h1>Quiz Desk</h1>
      <p className="muted">Sign in to take your quizzes.</p>
      <SignIn />
    </div>
  );
}
