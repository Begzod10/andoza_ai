import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMebelProject, deleteMebelProject, listMebelProjects } from "@/lib/api";
import { newProject } from "@/features/mebel/engine";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { intlLocale } from "@/i18n";

/** /mebel: a furniture workshop's cabinet projects. */
export default function MebelListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: projects, isLoading, isError, refetch } = useQuery({
    queryKey: ["mebel", "projects"],
    queryFn: listMebelProjects,
  });

  const create = useMutation({
    mutationFn: () => {
      const name = t("mebel.default_name");
      return createMebelProject(name, newProject(name));
    },
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: ["mebel", "projects"] });
      navigate(`/mebel/${p.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: deleteMebelProject,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mebel", "projects"] }),
  });

  async function onDelete(id: string, name: string) {
    if (!(await confirm({ title: t("mebel.delete_confirm", { name }), destructive: true, confirmLabel: t("mebel.delete") }))) return;
    remove.mutate(id);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{t("mebel.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("mebel.subtitle")}</p>
        </div>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          {t("mebel.new_project")}
        </Button>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
      ) : isError ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p>{t("mebel.load_failed")}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={() => void refetch()}>
            {t("mebel.retry")}
          </button>
        </div>
      ) : !projects?.length ? (
        <p className="rounded-2xl bg-neutral-50 p-6 text-center text-sm text-neutral-500">{t("mebel.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
              <Link to={`/mebel/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold text-neutral-900">{p.name}</p>
                <p className="text-xs text-neutral-500">
                  {t("mebel.updated", { date: new Date(p.updated_at).toLocaleString(intlLocale()) })}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => void onDelete(p.id, p.name)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                {t("mebel.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
