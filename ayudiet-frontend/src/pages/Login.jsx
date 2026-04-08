import LoginForm from "../components/auth/LoginForm";
import AuthShell from "../components/auth/AuthShell";

function Login() {
  return (
    <AuthShell
      eyebrow="Welcome Back"
      title="Hello, Welcome Back!"
      description="We’re happy to see you again. Sign in to continue managing patient care and personalized nutrition plans."
      panelTitle="Rooted in Ayurveda. Built for modern care."
      panelDescription="AyuDiet helps doctors centralize patient records, create structured diet plans, and keep follow-ups clear and consistent."
      quote="Food should be wholesome, pleasant, and served in the right quantity to nourish every tissue of the body."
      quoteAuthor="Charaka Samhita"
    >
      <LoginForm />
    </AuthShell>
  );
}

export default Login;
