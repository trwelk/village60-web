import { ChangeOwnPasswordForm } from "./ChangeOwnPasswordForm";
import { UserDetailsCard } from "./UserDetailsCard";

export default function AccountPage() {
  return (
    <main className="flex flex-col gap-8 text-ink">
      <UserDetailsCard />
      <ChangeOwnPasswordForm />
    </main>
  );
}
