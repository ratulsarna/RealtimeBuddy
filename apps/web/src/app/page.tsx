import { MeetingBuddyApp } from "@/components/meeting-buddy-app";
import { fetchBuddyConfig } from "@/lib/backend-config-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialStaticUserSeed = "";

  try {
    initialStaticUserSeed = (await fetchBuddyConfig()).staticUserSeed ?? "";
  } catch {
    initialStaticUserSeed = "";
  }

  return (
    <MeetingBuddyApp
      backendBaseUrl={process.env.BACKEND_BASE_URL ?? ""}
      initialStaticUserSeed={initialStaticUserSeed}
    />
  );
}
