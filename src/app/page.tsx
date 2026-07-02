import LangSwitcher from '@/components/LangSwitcher';
import WorkerLogin from './worker-login';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[430px] flex-col items-center px-6 pb-8 pt-10 text-center">
      <div className="flex w-full items-center justify-between">
        <div className="text-[22px] font-bold tracking-wider">
          KRON<b className="text-brand">TROL</b>
        </div>
        <LangSwitcher />
      </div>
      <WorkerLogin />
    </main>
  );
}
