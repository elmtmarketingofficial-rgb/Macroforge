/* All Recharts usage lives here so the library loads in its own lazy chunk —
   App.jsx pulls these in via React.lazy, keeping the main bundle lean. */
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, ComposedChart, Line, Scatter,
} from 'recharts';
import { T, MACROS, MK, mono } from './tokens';

const tooltipBox = { background: '#0a0a0c', border: `1px solid ${T.borderHi}`, borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 11 };
const tick = { fill: T.faint, fontSize: 9, fontFamily: 'JetBrains Mono' };

function NutriTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: '#0a0a0c', border: `1px solid ${T.borderHi}`, ...mono, fontSize: 11 }}>
      <div style={{ color: T.text, fontWeight: 700, marginBottom: 4 }}>{d.full}</div>
      <div style={{ color: T.lime }}>{Math.round(d.cals)} kcal</div>
      {MK.map((k) => <div key={k} style={{ color: MACROS[k].color }}>{MACROS[k].label}: {Math.round(d[k] * 10) / 10}g</div>)}
    </div>
  );
}

export function CaloriesChart({ data, range, goalCals }) {
  return (
    <div style={{ width: '100%', height: 190 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barCategoryGap={range > 14 ? 1 : 3}>
          <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="label" tick={tick} interval={range > 14 ? 4 : (range > 7 ? 1 : 0)} axisLine={{ stroke: T.border }} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={42} />
          <Tooltip content={<NutriTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {goalCals > 0 && <ReferenceLine y={goalCals} stroke={T.lime} strokeDasharray="4 4" strokeOpacity={0.7} />}
          <Bar dataKey="pCal" stackId="a" fill={MACROS.protein.color} />
          <Bar dataKey="cCal" stackId="a" fill={MACROS.carbs.color} />
          <Bar dataKey="fCal" stackId="a" fill={MACROS.fat.color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VolumeChart({ data, unit }) {
  return (
    <div style={{ width: '100%', height: 150 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={42} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipBox} labelStyle={{ color: T.text }} formatter={(v) => [`${Math.round(v)} ${unit}`, 'volume']} />
          <Bar dataKey="vol" radius={[3, 3, 0, 0]}>{data.map((d, i) => <Cell key={i} fill={T.lime} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeightChart({ data, unit }) {
  return (
    <div style={{ width: '100%', height: 150, marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} interval={Math.max(0, Math.floor(data.length / 6) - 1)} />
          <YAxis domain={['auto', 'auto']} tick={tick} axisLine={false} tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipBox} labelStyle={{ color: T.text }} formatter={(v, n) => [`${v} ${unit}`, n === 'trend' ? 'trend' : 'weigh-in']} />
          <Scatter dataKey="raw" fill={T.faint} shape={(props) => <circle cx={props.cx} cy={props.cy} r={2.4} fill={T.faint} />} />
          <Line dataKey="trend" stroke={T.lime} strokeWidth={2.4} dot={false} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function E1rmChart({ data, unit }) {
  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={{ stroke: T.border }} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={42} domain={['auto', 'auto']} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipBox} labelStyle={{ color: T.text }} formatter={(v) => [`${v} ${unit}`, 'e1RM']} />
          <Bar dataKey="best" radius={[3, 3, 0, 0]} fill={T.orange} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
