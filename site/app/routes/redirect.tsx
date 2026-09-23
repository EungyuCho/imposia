import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/en");
}

export default function RootRedirect() {
  return null;
}
