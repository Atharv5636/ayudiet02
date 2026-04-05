import LoginForm from "../components/auth/LoginForm";

function Login() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="min-h-screen w-full flex items-center justify-center px-4 sm:px-6">
        <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex justify-center">
            <LoginForm />
          </div>

          <div className="hidden lg:flex flex-col justify-center space-y-6 text-neutral-300">
            <p className="text-2xl leading-relaxed">
              ???? ???? ? ?????? ?
              <br />
              ????? ?????????????
            </p>

            <p className="max-w-md text-sm italic text-neutral-400">
              "Food should be wholesome, in proper quantity, and pleasant,
              nourishing the body's seven tissues."
            </p>

            <p className="text-sm text-neutral-500">- Charak Samhita</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
