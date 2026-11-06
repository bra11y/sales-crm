import type { Metadata } from "next";
import ProfileScreen from "@/components/profile/profile-screen";

export const metadata: Metadata = { title: "Profile · Sales CRM", robots: { index: false } };
export const maxDuration = 120;

export default function ProfilePage() {
  return <ProfileScreen view="profile" />;
}
