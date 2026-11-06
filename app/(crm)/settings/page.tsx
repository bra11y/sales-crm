import type { Metadata } from "next";
import ProfileScreen from "@/components/profile/profile-screen";

export const metadata: Metadata = { title: "Settings · Sales CRM", robots: { index: false } };

export default function SettingsPage() {
  return <ProfileScreen view="settings" />;
}
