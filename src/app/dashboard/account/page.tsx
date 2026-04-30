import { ChangeOwnPasswordForm } from "./ChangeOwnPasswordForm";
import { UserDetailsCard } from "./UserDetailsCard";

export default function AccountPage() {
  return (
    <main className="flex flex-col gap-8 text-ink">
      <div>
        <h1 className="village-page-title">My account</h1>
        <p className="mt-2 text-sm text-ink/70">
          View your profile and update the password you use to sign in.
        </p>
      </div>
      <UserDetailsCard />
      <ChangeOwnPasswordForm />
    </main>
  );
}
