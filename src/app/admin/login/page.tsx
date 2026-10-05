import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import AdminLoginForm from "@/components/admin-login-form";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function AdminLoginPage() {
  if (await isAdminAuthenticated()) redirect("/admin/dashboard");
  return <AdminLoginForm />;
}
