import { redirect } from "next/navigation";

// Middleware already redirects "/" based on auth/status; this is only reached
// if middleware ever lets a request through untouched.
export default function Home() {
  redirect("/termine");
}
