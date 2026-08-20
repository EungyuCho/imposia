import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/en/docs");
}

export default function RootRedirect() {
  return null;
}
