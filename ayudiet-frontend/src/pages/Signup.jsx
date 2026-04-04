import SignupForm from "../components/auth/SignupForm";

function Signup() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="min-h-screen w-full flex items-center justify-center px-6">
        <div className="grid w-full max-w-6xl grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="flex justify-center">
            <SignupForm />
          </div>

          <div className="hidden lg:flex flex-col justify-center space-y-6 text-neutral-300">
            <p className="text-2xl leading-relaxed">
              Healthy routines begin with
              <br />
              mindful, personalized planning.
            </p>

            <p className="text-sm italic text-neutral-400 max-w-md">
              Create your doctor account to manage patients, generate plans, and
              track progress with confidence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
