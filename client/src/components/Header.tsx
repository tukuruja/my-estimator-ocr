import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown } from 'lucide-react';

interface DropdownItem {
  label: string;
  href: string;
}

interface NavButtonProps {
  label: string;
  color: string;
  hoverColor: string;
  items?: DropdownItem[];
  href?: string;
}

function NavButton({ label, color, hoverColor, items, href }: NavButtonProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  if (!items && href) {
    return (
      <Link href={href}>
        <button className={`${color} ${hoverColor} text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1`}>
          {label}
        </button>
      </Link>
    );
  }

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        className={`${color} ${hoverColor} text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1`}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
      >
        {label}
        {items && <ChevronDown size={14} />}
      </button>
      {open && items && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[220px]">
          {items.map((item) => (
            <button
              key={item.href}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={() => {
                setLocation(item.href);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const inputItems: DropdownItem[] = [
    { label: '二次製品の条件入力', href: '/' },
    { label: '擁壁の条件入力', href: '/retaining-wall-input' },
    { label: '舗装の条件入力', href: '/pavement-input' },
    { label: '撤去工事の条件入力', href: '/demolition-input' },
  ];

  const estimateItems: DropdownItem[] = [
    { label: '二次製品の見積書', href: '/estimates/secondary-product' },
    { label: '擁壁の見積書', href: '/estimates/retaining-wall' },
    { label: '舗装の見積書', href: '/estimates/pavement' },
    { label: '撤去工事の見積書', href: '/estimates/demolition' },
  ];

  const priceTableItems: DropdownItem[] = [
    { label: '生コン・廃材処理単価', href: '/price-tables/concrete' },
    { label: '道路工単価', href: '/price-tables/road' },
    { label: '二次製品単価', href: '/price-tables/secondary' },
    { label: '機械単価', href: '/price-tables/machines' },
    { label: 'カッター単価', href: '/price-tables/cutter' },
  ];

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between sticky top-0 z-50">
      <div>
        <div className="text-lg font-bold text-indigo-700">土木見積サポート</div>
        <div className="text-[11px] text-gray-500">工種別の条件入力と OCR 根拠付き概算見積</div>
      </div>
      <nav className="flex items-center gap-2">
        <NavButton
          label="📋 条件入力"
          color="bg-blue-500"
          hoverColor="hover:bg-blue-600"
          items={inputItems}
        />
        <NavButton
          label="📄 見積書"
          color="bg-green-500"
          hoverColor="hover:bg-green-600"
          items={estimateItems}
        />
        <NavButton
          label="🖨 印刷"
          color="bg-gray-500"
          hoverColor="hover:bg-gray-600"
          href="/print"
        />
        <NavButton
          label="📊 単価マスタ"
          color="bg-purple-500"
          hoverColor="hover:bg-purple-600"
          items={priceTableItems}
        />
      </nav>
    </header>
  );
}
