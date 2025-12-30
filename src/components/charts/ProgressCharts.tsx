import React from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface WeightProgressData {
  date: string;
  weight: number;
  target: number;
}

interface CalorieData {
  date: string;
  consumed: number;
  burned: number;
  target: number;
}

interface MacroData {
  name: string;
  value: number;
  color: string;
}

interface ProgressChartsProps {
  weightData: WeightProgressData[];
  calorieData: CalorieData[];
  macroData: MacroData[];
}

const ProgressCharts: React.FC<ProgressChartsProps> = ({ weightData, calorieData, macroData }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Weight Progress Chart */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Weight Progress</CardTitle>
          <CardDescription>Track your weight journey over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="weight" 
                stroke="hsl(var(--primary))" 
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="target" 
                stroke="hsl(var(--secondary))" 
                strokeDasharray="5 5"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Calorie Tracking Chart */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Calorie Balance</CardTitle>
          <CardDescription>Daily calories consumed vs burned</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={calorieData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)'
                }}
              />
              <Bar dataKey="consumed" fill="hsl(var(--primary))" name="Consumed" />
              <Bar dataKey="burned" fill="hsl(var(--secondary))" name="Burned" />
              <Line 
                type="monotone" 
                dataKey="target" 
                stroke="hsl(var(--accent))" 
                strokeDasharray="5 5"
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Macronutrient Distribution */}
      <Card className="shadow-card lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-foreground">Today's Macronutrients</CardTitle>
          <CardDescription>Protein, Carbohydrates, and Fats distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <ResponsiveContainer width="100%" height={300} className="md:w-1/2">
              <PieChart>
                <Pie
                  data={macroData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {macroData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="flex flex-col gap-4 md:w-1/2">
              {macroData.map((macro, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: macro.color }}
                  />
                  <span className="text-foreground font-medium">{macro.name}</span>
                  <span className="text-muted-foreground ml-auto">{macro.value}g</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgressCharts;