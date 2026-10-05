import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import App from "./App";
import { ParentPortal } from "./components/ParentPortal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/global.css";

const parentRoute = window.location.pathname === "/parent";
const SkyRunWorkshop = lazy(() => import("./components/SkyRunWorkshop").then(m => ({default:m.SkyRunWorkshop})));
const workshopRoute = window.location.pathname === "/workshops/sky-run";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {workshopRoute ? <Suspense fallback={<p>Opening Sky Run…</p>}><SkyRunWorkshop /></Suspense> : parentRoute ? <ParentPortal /> : <App />}
  </ErrorBoundary>,
);
