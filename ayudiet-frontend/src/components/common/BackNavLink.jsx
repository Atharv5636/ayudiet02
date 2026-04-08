import { Link } from "react-router-dom";

function BackNavLink({ to, label, className = "" }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center text-sm font-medium text-gray-700 transition hover:text-gray-900 hover:underline ${className}`}
    >
      {`<- ${label}`}
    </Link>
  );
}

export default BackNavLink;

