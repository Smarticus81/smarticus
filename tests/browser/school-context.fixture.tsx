import { createRoot } from "react-dom/client";
import App from "../../client/src/App";
import { ParentPortal } from "../../client/src/components/ParentPortal";
import "../../client/src/styles/global.css";

createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("fixture") === "parent" ? <ParentPortal /> : <App />,
);
