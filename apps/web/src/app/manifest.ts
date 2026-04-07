import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RealtimeBuddy",
    short_name: "Buddy",
    description: "Live meeting companion for transcription, notes, and fast Q&A.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6",
    theme_color: "#d7673f",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
