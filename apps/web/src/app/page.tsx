import { MeetingBuddyApp } from "@/components/meeting-buddy-app";

export const dynamic = "force-dynamic";

export default function Home() {
  return <MeetingBuddyApp backendBaseUrl={process.env.BACKEND_BASE_URL ?? ""} />;
}
