import React from 'react'

export default function PageHeader({ title, subtitle, action, children }) {
  return (
    // Tighter on a phone, where every line above the fold is a line of the
    // actual page nobody can see.
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-black text-gray-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] sm:text-sm text-gray-500 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      {/*
        The buttons wrap instead of running off the screen.
        Pages hand this a row of six or seven icon buttons. Held on one
        unwrapping line, the last two sat past the right edge of a phone with
        no way to reach them — Products lost its print and scan buttons
        entirely. The inner rows pages supply are told to wrap as well, since
        they are the ones doing the overflowing.
      */}
      {(action || children) && (
        <div className="flex items-center flex-wrap gap-2 sm:flex-nowrap sm:flex-shrink-0
                        [&>div]:flex-wrap [&>div]:gap-2">
          {action}
          {children}
        </div>
      )}
    </div>
  )
}
