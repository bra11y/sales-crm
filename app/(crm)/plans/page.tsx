import { redirect } from "next/navigation";

// Career goals moved into Goals.
export default function PlansPage() {
  redirect("/goals");
}
