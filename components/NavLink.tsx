'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavLinkProps {
    href: string
    children: React.ReactNode
    className?: string
}

export default function NavLink({ href, children, className }: NavLinkProps) {
    const pathname = usePathname()
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center text-xs px-3 py-2 rounded-md font-medium transition-all duration-200",
                isActive
                    ? "bg-gray-100/80 text-gray-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)] border border-gray-200/50"
                    : "text-gray-600 hover:bg-gray-50/80 hover:text-gray-900 border border-transparent",
                className
            )}
        >
            {children}
        </Link>
    )
}
