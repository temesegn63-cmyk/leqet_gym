import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { Send, MessageSquare, ThumbsUp, AlertCircle } from 'lucide-react';

export interface FeedbackMessage {
  id: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  message: string;
  type: 'feedback' | 'motivation' | 'correction';
  timestamp: string;
  read: boolean;
}

interface TrainerFeedbackProps {
  memberId?: string;
  memberName?: string;
  feedback?: FeedbackMessage[];
  onSendFeedback?: (message: string, type: FeedbackMessage['type']) => void;
  isTrainer?: boolean;
  role?: 'trainer' | 'nutritionist';
}


export const TrainerFeedback: React.FC<TrainerFeedbackProps> = ({
  memberId = '1',
  memberName = 'Almaz Tadesse',
  feedback = [],
  onSendFeedback,
  isTrainer = false,
  role = 'trainer'
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState<FeedbackMessage['type']>('feedback');

  const roleLabel = role === 'nutritionist' ? 'Nutritionist' : 'Trainer';

  const handleSendFeedback = () => {
    if (newMessage.trim() && onSendFeedback) {
      onSendFeedback(newMessage.trim(), feedbackType);
      setNewMessage('');
    }
  };

  const getTypeIcon = (type: FeedbackMessage['type']) => {
    switch (type) {
      case 'feedback':
        return <MessageSquare className="w-4 h-4" />;
      case 'motivation':
        return <ThumbsUp className="w-4 h-4" />;
      case 'correction':
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: FeedbackMessage['type']) => {
    switch (type) {
      case 'feedback':
        return 'bg-blue-500/10 text-blue-700 border-blue-200';
      case 'motivation':
        return 'bg-green-500/10 text-green-700 border-green-200';
      case 'correction':
        return 'bg-orange-500/10 text-orange-700 border-orange-200';
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          {isTrainer ? `Feedback for ${memberName}` : `${roleLabel} Feedback`}
        </CardTitle>
        <CardDescription>
          {isTrainer 
            ? 'Send feedback and guidance to help your member achieve their goals'
            : `Messages and guidance from your ${roleLabel.toLowerCase()}`
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Send Feedback (Trainer Only) */}
        {isTrainer && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex gap-2">
              {(['feedback', 'motivation', 'correction'] as const).map((type) => (
                <Button
                  key={type}
                  variant={feedbackType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFeedbackType(type)}
                  className="capitalize"
                >
                  {getTypeIcon(type)}
                  <span className="ml-2">{type}</span>
                </Button>
              ))}
            </div>
            <Textarea
              placeholder="Write your feedback, motivation, or correction..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={3}
            />
            <Button 
              onClick={handleSendFeedback} 
              disabled={!newMessage.trim()}
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" />
              Send {feedbackType}
            </Button>
          </div>
        )}

        {/* Feedback List */}
        <div className="space-y-3">
          {feedback.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No feedback messages yet</p>
              {isTrainer && (
                <p className="text-sm">Send your first message to help guide your member!</p>
              )}
            </div>
          ) : (
            feedback
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    !msg.read && !isTrainer ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-primary text-white text-xs">
                        {msg.trainerName.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{msg.trainerName}</span>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getTypeColor(msg.type)}`}
                          >
                            {getTypeIcon(msg.type)}
                            <span className="ml-1 capitalize">{msg.type}</span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.timestamp), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        {msg.message}
                      </p>
                      {!msg.read && !isTrainer && (
                        <Badge variant="destructive" className="text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};