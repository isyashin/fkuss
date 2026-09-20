import { redirect } from "next/navigation";

// Старые ссылки на /menu ведут на полное меню на главной
export default function MenuRedirectPage() {
  redirect("/#menu");
}
