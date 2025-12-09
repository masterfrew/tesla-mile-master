import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Car, 
  Zap, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Shield,
  BarChart3
} from 'lucide-react';
import TeslaConnect from '@/components/TeslaConnect';

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Welkom bij KM Track',
      subtitle: 'Automatische kilometerregistratie voor je Tesla',
      content: (
        <div className="space-y-6">
          <div className="grid gap-4">
            {[
              { icon: Zap, text: 'Automatische dagelijkse synchronisatie' },
              { icon: BarChart3, text: 'Inzichtelijke statistieken en rapportages' },
              { icon: Shield, text: 'Veilig en GDPR-compliant' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Koppel je Tesla',
      subtitle: 'Verbind je Tesla account om te beginnen',
      content: (
        <div className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
            <div className="bg-primary/10 p-4 rounded-full w-fit mx-auto mb-4">
              <Car className="h-10 w-10 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Tesla Account Koppelen</h3>
            <p className="text-muted-foreground mb-6">
              We gebruiken de officiële Tesla OAuth voor veilige toegang tot je voertuiggegevens.
            </p>
            <TeslaConnect />
          </div>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <p>
              Je gegevens worden veilig opgeslagen en nooit gedeeld met derden. 
              Je kunt de koppeling op elk moment verbreken.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Je bent klaar!',
      subtitle: 'Je account is ingesteld en klaar voor gebruik',
      content: (
        <div className="space-y-6 text-center">
          <div className="bg-success/10 p-6 rounded-full w-fit mx-auto">
            <CheckCircle2 className="h-16 w-16 text-success" />
          </div>
          <div>
            <h3 className="font-semibold text-xl mb-2">Alles is ingesteld!</h3>
            <p className="text-muted-foreground">
              Je kilometers worden nu automatisch bijgehouden. 
              Bekijk je dashboard voor een overzicht.
            </p>
          </div>
          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> De eerste synchronisatie kan tot 24 uur duren. 
              Je ontvangt een melding zodra je gegevens beschikbaar zijn.
            </p>
          </div>
        </div>
      ),
    },
  ];

  const currentStep = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/40 shadow-elegant">
        <CardContent className="p-8">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="secondary">Stap {step + 1} van {steps.length}</Badge>
              <button 
                onClick={onSkip}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Overslaan
              </button>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Content */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">{currentStep.title}</h2>
            <p className="text-muted-foreground">{currentStep.subtitle}</p>
          </div>

          <div className="mb-8">
            {currentStep.content}
          </div>

          {/* Navigation */}
          <div className="flex gap-4">
            {step > 0 && (
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Vorige
              </Button>
            )}
            <Button onClick={handleNext} className="flex-1 bg-primary hover:bg-primary/90">
              {step === steps.length - 1 ? 'Naar Dashboard' : 'Volgende'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingFlow;
