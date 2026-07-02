import { requireWorker } from '@/lib/session';
import LangSwitcher from '@/components/LangSwitcher';
import LogoutButton from '@/components/LogoutButton';
import WorkerTabbar from '@/components/WorkerTabbar';

export default async function WorkerLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireWorker();

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <div>
          <div className="text-[16px] font-bold leading-tight">{user.name}</div>
          <LogoutButton className="text-[11.5px] text-muted underline" />
        </div>
        <LangSwitcher />
      </div>
      <div className="flex-1 px-4 pb-24 pt-2">{children}</div>
      <WorkerTabbar />
    </div>
  );
}
