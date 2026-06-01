import React from 'react';
import { Bird, Sparkles, MapPin, Calendar, Feather } from 'lucide-react';

const BirdSightings = ({ birds }) => {
  const notable = (birds && birds.notableSightings) || [];
  const recent = (birds && birds.recentSightings) || [];

  const fmtDate = (d) => {
    try { return new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-500 fade-in space-y-8">

      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-sm flex items-center gap-4 ring-1 ring-slate-900/5">
        <div className="bg-emerald-500/10 p-3 rounded-xl text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
          <Bird size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-800">Wildlife &amp; Bird Watch</h2>
          <p className="text-sm font-semibold text-emerald-600 tracking-wide uppercase">Live sightings near the preserve</p>
        </div>
      </div>

      {/* Notable / rare sightings */}
      {notable.length > 0 && (
        <div>
          <h3 className="text-lg font-display font-bold text-slate-800 mb-4 flex items-center gap-2 px-2">
            <Sparkles size={18} className="text-amber-500" /> Notable &amp; Rare Sightings
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {notable.map((b, i) => (
              <div key={i} className="p-6 rounded-3xl border border-amber-400/30 bg-amber-500/5 backdrop-blur-md ring-1 ring-inset ring-amber-500/20 hover:-translate-y-1 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full ring-1 ring-inset ring-amber-500/20">★ Rare</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={12} /> {fmtDate(b.date)}</span>
                </div>
                <h4 className="text-lg font-bold text-slate-800">{b.species}</h4>
                {b.sciName && <p className="text-xs italic text-slate-400 mb-2">{b.sciName}</p>}
                <p className="text-sm text-slate-500 flex items-start gap-1"><MapPin size={13} className="mt-0.5 shrink-0" /> {b.location}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently seen */}
      <div>
        <h3 className="text-lg font-display font-bold text-slate-800 mb-4 flex items-center gap-2 px-2">
          <Feather size={18} className="text-emerald-500" /> Recently Seen Near the Preserve
        </h3>
        {recent.length > 0 ? (
          <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl p-4 sm:p-6 ring-1 ring-slate-900/5">
            <div className="grid gap-1 sm:grid-cols-2">
              {recent.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/60 transition-colors">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-700">{b.species}</span>
                    <span className="block text-xs text-slate-400 truncate">{b.location}</span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">{fmtDate(b.date)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-sm px-2">Sightings will appear here after the next update.</p>
        )}
      </div>

      {/* Attribution */}
      <p className="text-center text-xs text-slate-400 pt-2">
        {birds && birds.speciesCount ? `${birds.speciesCount} species seen recently · ` : ''}
        Data from {(birds && birds.source) || 'eBird · Cornell Lab of Ornithology'}
      </p>
    </div>
  );
};

export default BirdSightings;
