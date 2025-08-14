import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Car, BarChart3, FileSpreadsheet, Shield, Clock, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Car className="h-8 w-8 text-primary animate-bounce" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                KM Track
              </span>
            </div>
            <Link to="/auth">
              <Button variant="outline" className="border-primary/20 hover:border-primary/40">
                Inloggen
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
                Kilometerregistratie
              </span>
              <br />
              <span className="text-foreground">voor Tesla eigenaren</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Automatiseer je kilometerregistratie met onze intuïtieve platform. 
              Perfect geïntegreerd met Excel/Sheets sync voor naadloze administratie.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth">
                <Button size="lg" className="bg-gradient-primary hover:opacity-90 text-white shadow-elegant">
                  Gratis beginnen
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-primary/20 hover:border-primary/40">
                Meer informatie
              </Button>
            </div>
          </div>
        </div>

        {/* Floating elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-primary/10 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-accent/10 rounded-full blur-xl animate-pulse delay-1000"></div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Waarom KM Track?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Slimme kilometerregistratie voor elke auto met automatische 
              synchronisatie naar Excel/Sheets.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Car,
                title: "Tesla Integratie",
                description: "Speciaal ontwikkeld voor Tesla voertuigen met ondersteuning voor alle modellen."
              },
              {
                icon: FileSpreadsheet,
                title: "Excel/Sheets Sync",
                description: "Automatische synchronisatie met Excel en Google Sheets voor eenvoudige rapportage."
              },
              {
                icon: BarChart3,
                title: "Slimme Analytics",
                description: "Krijg inzicht in je rijgedrag en kilometerpatronen met geavanceerde analyses."
              },
              {
                icon: Shield,
                title: "Veilig & Betrouwbaar",
                description: "Je data is veilig opgeslagen met enterprise-grade beveiliging."
              },
              {
                icon: Clock,
                title: "Tijdsbesparing",
                description: "Automatiseer je administratie en bespaar uren per maand."
              },
              {
                icon: Zap,
                title: "Snel & Efficiënt",
                description: "Lightning-fast performance voor een soepele gebruikerservaring."
              }
            ].map((feature, index) => (
              <Card key={index} className="border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <feature.icon className="h-12 w-12 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-primary/10 via-primary-glow/10 to-accent/10 rounded-3xl p-12 border border-primary/20">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Klaar om te beginnen?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Start vandaag nog met het professionaliseren van je kilometerregistratie.
            </p>
            <Link to="/auth">
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 text-white shadow-elegant">
                Account aanmaken
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <Car className="h-6 w-6 text-primary animate-pulse" />
              <span className="font-semibold">KM Track</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 KM Track. Alle rechten voorbehouden.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;