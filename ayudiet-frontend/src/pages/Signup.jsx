import SignupForm from "../components/auth/SignupForm";
import AuthShell from "../components/auth/AuthShell";

function Signup() {
  return (
    <AuthShell
      eyebrow="Create Account"
      title="Start Your AyuDiet Workspace"
      description="Set up your account and begin organizing patient assessments, care plans, and progress tracking from one calm dashboard."
      panelTitle="Thoughtful nutrition workflows for every consultation."
      panelDescription="Bring together Ayurvedic guidance, patient history, and plan tracking in a space that feels clear, focused, and clinical."
      quote="When food and routine are chosen with awareness, healing becomes part of daily life."
      quoteAuthor="AyuDiet care philosophy"
    >
      <SignupForm />
    </AuthShell>
  );
}

export default Signup;
