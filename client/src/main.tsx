import { createRoot } from "react-dom/client";
import App from "./App";
import { ParentPortal } from "./components/ParentPortal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/global.css";

const parentRoute = window.location.pathname === "/parent";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {parentRoute ? <ParentPortal /> : <App />}
  </ErrorBoundary>,
);
