"use client";

import { VillageSelect } from "@/components/VillageSelect";
import type { Home } from "@/lib/homes/service";
import type { UserSummary } from "@/lib/users/service";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type UsersAdminUIProps = {
  initialUsers: UserSummary[];
  initialHomes: Home[];
};

export function UsersAdminUI({
  initialUsers,
  initialHomes,
}: UsersAdminUIProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "care">("admin");
  const [createPrimaryId, setCreatePrimaryId] = useState("");
  const [createAdditionalIds, setCreateAdditionalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [editCareUserId, setEditCareUserId] = useState<string | null>(null);
  const [editPrimaryId, setEditPrimaryId] = useState("");
  const [editAdditionalIds, setEditAdditionalIds] = useState<Set<string>>(
    () => new Set(),
  );

  const homeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of initialHomes) {
      m.set(h.id, h.name);
    }
    return m;
  }, [initialHomes]);

  async function parseError(res: Response): Promise<string> {
    try {
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
      ) {
        return (data as { error: string }).error;
      }
    } catch {
      /* ignore */
    }
    return "Request failed.";
  }

  function toggleCreateAdditional(id: string) {
    setCreateAdditionalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleEditAdditional(id: string) {
    setEditAdditionalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (createRole === "care" && !createPrimaryId) {
      setError("Select a primary home for this care user.");
      return;
    }
    const body: Record<string, unknown> = {
      email: createEmail,
      password: createPassword,
      role: createRole,
    };
    if (createRole === "care") {
      body.primaryHomeId = createPrimaryId;
      body.additionalHomeIds = [...createAdditionalIds];
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setCreateEmail("");
    setCreatePassword("");
    setCreateRole("admin");
    setCreatePrimaryId("");
    setCreateAdditionalIds(new Set());
    router.refresh();
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    setError(null);
    const res = await fetch(`/api/users/${resetUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPassword }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setResetUserId(null);
    setResetPassword("");
    router.refresh();
  }

  function startEditCare(u: UserSummary) {
    setEditCareUserId(u.id);
    setEditPrimaryId(u.primaryHomeId ?? "");
    setEditAdditionalIds(new Set(u.additionalHomeIds));
    setError(null);
  }

  async function onSaveCareHomes(e: React.FormEvent) {
    e.preventDefault();
    if (!editCareUserId) return;
    setError(null);
    const res = await fetch(`/api/users/${editCareUserId}/care-homes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryHomeId: editPrimaryId,
        additionalHomeIds: [...editAdditionalIds],
      }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setEditCareUserId(null);
    router.refresh();
  }

  const activeHomes = initialHomes.filter((h) => h.archivedAtUtcMs == null);

  return (
    <main className="flex flex-col gap-8 text-ink">
      {error ? <p className="village-alert-error">{error}</p> : null}

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">Add user</h2>
        <form onSubmit={onCreate} className="mt-5 flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
              <span className="village-field-label">Email</span>
              <input
                className="village-input"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm">
              <span className="village-field-label">Initial password</span>
              <input
                className="village-input"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </label>
            <div className="flex w-full flex-col gap-1.5 text-sm sm:w-44">
              <label
                className="village-field-label"
                htmlFor="users-admin-create-role"
              >
                Role
              </label>
              <VillageSelect
                id="users-admin-create-role"
                value={createRole}
                onChange={(v) => setCreateRole(v as "admin" | "care")}
                options={[
                  { value: "admin", label: "Admin" },
                  { value: "care", label: "Care" },
                ]}
              />
            </div>
          </div>
          {createRole === "care" ? (
            <div className="village-card-soft flex flex-col gap-4">
              <div className="flex max-w-md flex-col gap-1.5 text-sm">
                <label
                  className="village-field-label"
                  htmlFor="users-admin-create-primary-home"
                >
                  Primary home
                </label>
                <VillageSelect
                  id="users-admin-create-primary-home"
                  value={createPrimaryId}
                  onChange={(v) => {
                    setCreatePrimaryId(v);
                    setCreateAdditionalIds((prev) => {
                      const next = new Set(prev);
                      next.delete(v);
                      return next;
                    });
                  }}
                  placeholder="Select a home"
                  options={activeHomes.map((h) => ({
                    value: h.id,
                    label: h.name,
                  }))}
                />
              </div>
              <fieldset className="text-sm">
                <legend className="village-field-label">Additional homes</legend>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  {activeHomes.map((h) => (
                    <label
                      key={h.id}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        className="village-checkbox"
                        checked={createAdditionalIds.has(h.id)}
                        disabled={h.id === createPrimaryId}
                        onChange={() => toggleCreateAdditional(h.id)}
                      />
                      <span
                        className={
                          h.id === createPrimaryId
                            ? "text-ink/40"
                            : "font-medium text-ink"
                        }
                      >
                        {h.name}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}
          <button type="submit" className="village-btn-primary w-fit">
            Create user
          </button>
        </form>
      </section>

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">All users</h2>
        <div className="village-table-wrap mt-5">
          <table className="village-table">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Email</th>
                <th className="village-th">Role</th>
                <th className="village-th">Homes</th>
                <th className="village-th">Actions</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {initialUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="village-td-muted py-10 text-center">
                    No users loaded.
                  </td>
                </tr>
              ) : (
                initialUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="village-td font-medium">{u.email}</td>
                    <td className="village-td-muted capitalize">{u.role}</td>
                    <td className="village-td-muted">
                      {u.role === "admin" ? (
                        <span className="text-ink/55">All homes</span>
                      ) : (
                        <span>
                          Primary:{" "}
                          {u.primaryHomeId
                            ? (homeNameById.get(u.primaryHomeId) ??
                              u.primaryHomeId.slice(0, 8))
                            : "—"}
                          {u.additionalHomeIds.length > 0 ? (
                            <span className="mt-1 block text-xs text-ink/55">
                              Also:{" "}
                              {u.additionalHomeIds
                                .map(
                                  (id) => homeNameById.get(id) ?? id.slice(0, 8),
                                )
                                .join(", ")}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="village-td align-top">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                          {resetUserId === u.id ? (
                            <form
                              className="flex flex-wrap items-end gap-2"
                              onSubmit={onResetPassword}
                            >
                              <input
                                type="password"
                                className="village-input max-w-[12rem] text-sm"
                                placeholder="New password"
                                value={resetPassword}
                                onChange={(e) =>
                                  setResetPassword(e.target.value)
                                }
                                required
                                autoComplete="new-password"
                              />
                              <button
                                type="submit"
                                className="village-btn-primary px-3 py-1.5 text-xs"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="village-btn-secondary px-3 py-1.5 text-xs"
                                onClick={() => {
                                  setResetUserId(null);
                                  setResetPassword("");
                                }}
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              className="village-link cursor-pointer border-0 bg-transparent p-0"
                              onClick={() => {
                                setResetUserId(u.id);
                                setResetPassword("");
                                setError(null);
                              }}
                            >
                              Reset password
                            </button>
                          )}
                          {u.role === "care" ? (
                            editCareUserId === u.id ? (
                              <form
                                className="village-card-soft mt-1 flex w-full min-w-[16rem] flex-col gap-3 p-4"
                                onSubmit={onSaveCareHomes}
                              >
                                <div className="flex flex-col gap-1.5 text-xs">
                                  <label
                                    className="village-field-label text-xs"
                                    htmlFor={`users-admin-edit-primary-${u.id}`}
                                  >
                                    Primary
                                  </label>
                                  <VillageSelect
                                    id={`users-admin-edit-primary-${u.id}`}
                                    className="text-sm"
                                    value={editPrimaryId}
                                    onChange={(v) => {
                                      setEditPrimaryId(v);
                                      setEditAdditionalIds((prev) => {
                                        const next = new Set(prev);
                                        next.delete(v);
                                        return next;
                                      });
                                    }}
                                    options={activeHomes.map((h) => ({
                                      value: h.id,
                                      label: h.name,
                                    }))}
                                  />
                                </div>
                                <fieldset className="text-xs">
                                  <legend className="village-field-label text-xs">
                                    Additional
                                  </legend>
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
                                    {activeHomes.map((h) => (
                                      <label
                                        key={h.id}
                                        className="flex cursor-pointer items-center gap-2"
                                      >
                                        <input
                                          type="checkbox"
                                          className="village-checkbox"
                                          checked={editAdditionalIds.has(
                                            h.id,
                                          )}
                                          disabled={h.id === editPrimaryId}
                                          onChange={() =>
                                            toggleEditAdditional(h.id)
                                          }
                                        />
                                        <span className="font-medium text-ink">
                                          {h.name}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="submit"
                                    className="village-btn-primary px-3 py-1.5 text-xs"
                                  >
                                    Save homes
                                  </button>
                                  <button
                                    type="button"
                                    className="village-btn-secondary px-3 py-1.5 text-xs"
                                    onClick={() =>
                                      setEditCareUserId(null)
                                    }
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button
                                type="button"
                                className="village-link cursor-pointer border-0 bg-transparent p-0"
                                onClick={() => startEditCare(u)}
                              >
                                Edit Care homes
                              </button>
                            )
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
