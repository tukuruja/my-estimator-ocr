import Header from '@/components/Header';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-xl">
          <Construction size={64} className="mx-auto text-gray-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-700 mb-2">{title}</h1>
          <p className="text-gray-500">この画面は準備中です。</p>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            現在は「二次製品の条件入力」と「単価マスタ」の画面が利用できます。
          </p>
        </div>
      </main>
    </div>
  );
}
